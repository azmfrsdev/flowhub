/**
 * FlowHub for Gmail (PRD 7.27, ADR-0020).
 *
 * Runs in the sales inbox's own Google account. Every minute it sends new
 * inbox emails from outside the company to FlowHub with the workspace key,
 * then labels each thread with FlowHub's verdict. As a Gmail add-on, the panel
 * beside an open email shows the verdict and links back to FlowHub.
 *
 * It also sends the meeting invites a person sends from FlowHub (PRD 7.28,
 * ADR-0020 D7): it creates each event in this account's Calendar, with Google
 * Meet, emails the guests, and tells FlowHub the Meet link.
 *
 * FlowHub never holds a Google token: Gmail and Calendar access stay inside
 * this script, in this account. FlowHub receives only what this script sends it.
 *
 * Setup: see README.md next to this file. In short, set the script properties
 * FLOWHUB_URL and FLOWHUB_KEY, run start() once, and install the test
 * deployment as a Gmail add-on.
 */

var LABELS = { lead: 'FlowHub · Lead', maybe: 'FlowHub · Maybe', not_a_lead: 'FlowHub · Not a lead' };
var LABEL_PREFIX = 'FlowHub · ';
/** How many emails one check sends at most. FlowHub's own limit is 30 a day. */
var PER_CHECK = 10;
/** An email FlowHub couldn't read is tried this many times, then left alone. */
var MAX_TRIES = 3;
var FREE_MAIL = /(^|\.)(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|proton|protonmail|pm|aol|gmx|mail|zoho|yandex)\.((com|co|net)(\.[a-z]{2})?|my|me|sg|uk)$/i;

/* ---------- Setup ---------- */

/** Run once: checks the settings, creates the labels and the one-minute trigger, and says hello to FlowHub. */
function start() {
  var settings = settings_();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'checkInbox') ScriptApp.deleteTrigger(trigger);
  });
  Object.keys(LABELS).forEach(function (key) { labelId_(LABELS[key]); });
  var props = PropertiesService.getScriptProperties();
  // The first check also picks up emails from the last 15 minutes, so a test email sent just before is read.
  props.setProperty('LAST_CHECK', String(Math.floor(Date.now() / 1000) - 15 * 60));
  var reply = call_({ action: 'ping', mailbox: mailbox_() });
  if (reply.code !== 200) throw new Error('FlowHub refused the key (' + reply.code + '): ' + (reply.body.error || 'check FLOWHUB_URL and FLOWHUB_KEY.'));
  ScriptApp.newTrigger('checkInbox').timeBased().everyMinutes(1).create();
  Logger.log('Connected to ' + reply.body.workspace + ' at ' + settings.url + '. Checking ' + mailbox_() + ' every minute.');
}

/** Stops the one-minute check. The add-on panel keeps working. */
function stop() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'checkInbox') ScriptApp.deleteTrigger(trigger);
  });
  Logger.log('Stopped. Run start() to check the inbox again.');
}

function settings_() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty('FLOWHUB_URL') || '').replace(/\/+$/, '');
  var key = props.getProperty('FLOWHUB_KEY') || '';
  if (!/^https:\/\//.test(url)) throw new Error('Set the script property FLOWHUB_URL to FlowHub\'s address, such as https://flowhub-xxxx.asia-southeast1.run.app');
  if (!/^fhk_[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Set the script property FLOWHUB_KEY to the key from FlowHub, Settings › Inbox.');
  return { url: url, key: key };
}

/* ---------- The one-minute check ---------- */

/** Sends new inbox emails from outside the company to FlowHub, and labels each thread with the verdict. */
function checkInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var startedAt = Math.floor(Date.now() / 1000);
    var since = Number(props.getProperty('LAST_CHECK') || startedAt - 120);
    var seen = JSON.parse(props.getProperty('SEEN') || '[]');
    var tries = JSON.parse(props.getProperty('TRIES') || '{}');
    var me = mailbox_();
    // FlowHub's replies say how many meeting invites wait, so the script asks for them only when there are some.
    var invitesWaiting = 0;
    // A minute of overlap, so an email that arrived during the last check isn't missed. SEEN stops it being sent twice.
    var list = Gmail.Users.Messages.list('me', { q: 'in:inbox after:' + (since - 60), maxResults: 30 });
    var ids = (list.messages || []).map(function (m) { return m.id; }).reverse();
    var sent = 0;
    var stopHere = false;
    for (var i = 0; i < ids.length && sent < PER_CHECK && !stopHere; i++) {
      var id = ids[i];
      if (seen.indexOf(id) !== -1) continue;
      var message, email;
      try {
        message = Gmail.Users.Messages.get('me', id, { format: 'full' });
        email = toEmail_(message);
      } catch (err) {
        // One email that can't be read never blocks the others.
        tries[id] = (tries[id] || 0) + 1;
        Logger.log('Could not read ' + id + ' in Gmail, try ' + tries[id] + ': ' + err.message);
        if (tries[id] >= MAX_TRIES) { seen.push(id); delete tries[id]; }
        continue;
      }
      if (!email || isInternal_(email.fromAddress, me)) { seen.push(id); continue; }
      var reply = call_({ action: 'triage', mailbox: me, email: email.payload });
      sent++;
      if (reply.body && reply.body.invites) invitesWaiting = reply.body.invites;
      if (reply.code === 200) {
        if (reply.body.item) applyLabel_(message.threadId, reply.body.item.label);
        seen.push(id);
      } else if (reply.code === 429 || reply.code === 401) {
        // The daily limit, the caps or a replaced key: try again on a later check, and stop for now.
        Logger.log('FlowHub said ' + reply.code + ': ' + reply.body.error);
        stopHere = true;
      } else {
        tries[id] = (tries[id] || 0) + 1;
        Logger.log('FlowHub couldn\'t read ' + id + ' (' + reply.code + '), try ' + tries[id] + ': ' + reply.body.error);
        if (tries[id] >= MAX_TRIES) { seen.push(id); delete tries[id]; }
      }
    }
    if (!stopHere) props.setProperty('LAST_CHECK', String(startedAt));
    props.setProperty('SEEN', JSON.stringify(seen.slice(-250)));
    props.setProperty('TRIES', JSON.stringify(tries));
    if (sent === 0) {
      var ping = call_({ action: 'ping', mailbox: me });
      if (ping.body && ping.body.invites) invitesWaiting = ping.body.invites;
    }
    if (invitesWaiting > 0) sendInvites_();
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Meeting invites sent from FlowHub ---------- */

/**
 * Takes the invites waiting in FlowHub, creates each event in this account's
 * Calendar with Google Meet, and lets Calendar email the guests. FlowHub's
 * invite ID is the event's ID, so a second try after a lost reply finds the
 * event instead of creating another one.
 */
function sendInvites_() {
  var reply = call_({ action: 'invites' });
  if (reply.code !== 200) {
    Logger.log('FlowHub said ' + reply.code + ' when asked for invites: ' + reply.body.error);
    return;
  }
  (reply.body.invites || []).forEach(function (invite) {
    var result;
    try {
      var event = createEvent_(invite);
      result = { action: 'invite-result', id: invite.id, ok: true, eventUrl: event.htmlLink || null, meetUrl: meetUrl_(event) };
      Logger.log('Sent the invite "' + invite.title + '" to ' + invite.guests.join(', '));
    } catch (err) {
      result = { action: 'invite-result', id: invite.id, ok: false, error: String(err && err.message ? err.message : err).slice(0, 300) };
      Logger.log('Could not send the invite ' + invite.id + ': ' + result.error);
    }
    call_(result);
  });
}

function createEvent_(invite) {
  var resource = {
    id: invite.id,
    summary: invite.title,
    description: invite.details,
    start: { dateTime: invite.start, timeZone: invite.timeZone },
    end: { dateTime: invite.end, timeZone: invite.timeZone },
    attendees: invite.guests.map(function (email) { return { email: email }; }),
    conferenceData: { createRequest: { requestId: invite.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  };
  var event;
  try {
    event = Calendar.Events.insert(resource, 'primary', { conferenceDataVersion: 1, sendUpdates: 'all' });
  } catch (err) {
    // Sent on an earlier check whose reply didn't reach FlowHub: the event already has FlowHub's ID.
    if (!/already exists|duplicate|409/i.test(String(err && err.message))) throw err;
    event = Calendar.Events.get('primary', invite.id);
  }
  if (!meetUrl_(event)) {
    // Google sometimes finishes setting up the Meet a moment after the event is created.
    Utilities.sleep(2000);
    event = Calendar.Events.get('primary', event.id);
  }
  return event;
}

function meetUrl_(event) {
  if (event.hangoutLink) return event.hangoutLink;
  var points = (event.conferenceData && event.conferenceData.entryPoints) || [];
  var video = points.filter(function (point) { return point.entryPointType === 'video'; })[0];
  return video ? video.uri : null;
}

/* ---------- The panel beside an open email (Gmail add-on) ---------- */

function onHomepage() {
  var text;
  try {
    var reply = call_({ action: 'ping', mailbox: mailbox_() });
    text = reply.code === 200 ? '<b>Connected to ' + escape_(reply.body.workspace) + '.</b><br>Open an email to see what FlowHub made of it.' : 'FlowHub refused the key. Make a new one in Settings › Inbox and paste it into the script.';
  } catch (err) {
    text = escape_(err.message);
  }
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('FlowHub').setSubtitle('Inbox leads'))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(text)))
    .build();
}

function onGmailMessage(e) {
  return panel_(e.gmail.messageId);
}

/** "Send to FlowHub now": reads this email straight away, without waiting for the minute. */
function sendNow(e) {
  var messageId = e.parameters.messageId;
  var message = Gmail.Users.Messages.get('me', messageId, { format: 'full' });
  var email = toEmail_(message);
  var note = null;
  if (email) {
    var reply = call_({ action: 'triage', mailbox: mailbox_(), email: email.payload });
    if (reply.code === 200 && reply.body.item) applyLabel_(message.threadId, reply.body.item.label);
    else if (reply.code === 200 && reply.body.skipped) note = 'This email is from your own company. FlowHub reads emails from outside.';
    else note = 'FlowHub couldn\'t read it: ' + (reply.body.error || reply.code);
  }
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(panel_(messageId, note))).build();
}

var VERDICT = { lead: 'Lead', maybe: 'Maybe', existing_deal: 'Existing deal', not_a_lead: 'Not a lead' };

function panel_(messageId, note) {
  var card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('FlowHub').setSubtitle('Inbox leads'));
  var section = CardService.newCardSection();
  var reply;
  try {
    reply = call_({ action: 'status', messageId: messageId });
  } catch (err) {
    section.addWidget(CardService.newTextParagraph().setText(escape_(err.message)));
    return card.addSection(section).build();
  }
  if (note) section.addWidget(CardService.newTextParagraph().setText('<i>' + escape_(note) + '</i>'));
  if (reply.code !== 200) {
    section.addWidget(CardService.newTextParagraph().setText('FlowHub refused the key. Make a new one in Settings › Inbox.'));
    return card.addSection(section).build();
  }
  if (!reply.body.found) {
    section.addWidget(CardService.newTextParagraph().setText('FlowHub hasn\'t read this email yet. New emails are read within a minute.'));
    section.addWidget(CardService.newTextButton().setText('Send to FlowHub now').setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(CardService.newAction().setFunctionName('sendNow').setParameters({ messageId: messageId })));
    return card.addSection(section).build();
  }
  var item = reply.body.item;
  section.addWidget(CardService.newDecoratedText().setTopLabel(item.company || 'Company unknown').setText('<b>' + VERDICT[item.verdict] + '</b>' + (item.score === null ? '' : ' · score ' + item.score + ' of 100')).setWrapText(true));
  section.addWidget(CardService.newTextParagraph().setText(escape_(item.summary)));
  if (item.offerings.length) section.addWidget(CardService.newDecoratedText().setTopLabel('Could need').setText(escape_(item.offerings.join(', '))).setWrapText(true));
  var state = stateLine_(item);
  if (state) section.addWidget(CardService.newTextParagraph().setText('<b>' + escape_(state) + '</b>'));
  section.addWidget(CardService.newTextButton().setText('Open in FlowHub').setTextButtonStyle(CardService.TextButtonStyle.FILLED).setOpenLink(CardService.newOpenLink().setUrl(item.url)));
  if (item.status === 'reread') {
    section.addWidget(CardService.newTextButton().setText('Send to FlowHub now').setOnClickAction(CardService.newAction().setFunctionName('sendNow').setParameters({ messageId: messageId })));
  }
  return card.addSection(section).build();
}

function stateLine_(item) {
  if (item.status === 'intake_started') return item.intake === 'running' ? 'Intake is reading it now. It stops at Gate A for you.' : item.intake === 'removed' ? 'Its deal was moved to the recycle bin.' : 'Intake done. Waiting for you at Gate A.';
  if (item.status === 'waiting') return 'Waiting for you in FlowHub: open a deal or dismiss.';
  if (item.status === 'opened') return 'A deal is open in FlowHub.';
  if (item.status === 'added_to_deal') return 'Added to the deal in FlowHub.';
  if (item.status === 'reread') return 'You said this is a lead. Send it again so FlowHub reads it.';
  return null;
}

/* ---------- Helpers ---------- */

function call_(body) {
  var settings = settings_();
  var response = UrlFetchApp.fetch(settings.url + '/api/inbox', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + settings.key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var parsed = {};
  try { parsed = JSON.parse(response.getContentText()); } catch (err) { parsed = { error: response.getContentText().slice(0, 200) }; }
  return { code: response.getResponseCode(), body: parsed };
}

var mailboxCache_ = null;
function mailbox_() {
  if (!mailboxCache_) mailboxCache_ = Gmail.Users.getProfile('me').emailAddress.toLowerCase();
  return mailboxCache_;
}

/** The company's own addresses: this mailbox, and its domain unless that is free mail. */
function isInternal_(address, me) {
  if (address === me) return true;
  var ownDomain = me.split('@')[1];
  return !FREE_MAIL.test(ownDomain) && address.split('@')[1] === ownDomain;
}

/** The fields FlowHub needs from a Gmail message, or null for one of the account's own drafts or sent emails. */
function toEmail_(message) {
  var labels = message.labelIds || [];
  if (labels.indexOf('SENT') !== -1 || labels.indexOf('DRAFT') !== -1) return null;
  var headers = {};
  (message.payload.headers || []).forEach(function (h) { headers[h.name.toLowerCase()] = h.value; });
  var from = headers.from || '';
  var match = from.match(/<([^<>\s]+@[^<>\s]+)>/);
  var address = (match ? match[1] : from).trim().toLowerCase();
  if (address.indexOf('@') === -1) return null;
  return {
    fromAddress: address,
    payload: {
      messageId: message.id,
      threadId: message.threadId,
      from: from.slice(0, 320),
      to: (headers.to || '').slice(0, 2000),
      subject: (headers.subject || '').slice(0, 500),
      body: bodyText_(message.payload).slice(0, 20000),
      receivedAt: new Date(Number(message.internalDate)).toISOString(),
    },
  };
}

/** The plain-text body, or the HTML body with its tags removed. */
function bodyText_(payload) {
  var plain = findPart_(payload, 'text/plain');
  if (plain) return decode_(plain);
  var html = findPart_(payload, 'text/html');
  if (!html) return '';
  return decode_(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function findPart_(part, type) {
  if (part.mimeType === type && part.body && part.body.data) return part.body.data;
  var parts = part.parts || [];
  for (var i = 0; i < parts.length; i++) {
    var found = findPart_(parts[i], type);
    if (found) return found;
  }
  return null;
}

/**
 * A body part's data as text. The Gmail advanced service in Apps Script gives
 * it as a list of bytes; the Gmail API itself gives web-safe base64. Both work.
 */
function decode_(data) {
  if (Array.isArray(data)) return Utilities.newBlob(data).getDataAsString('UTF-8');
  var text = String(data).replace(/\s/g, '');
  var padded = text + '==='.slice((text.length + 3) % 4);
  try {
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
  } catch (err) {
    return Utilities.newBlob(Utilities.base64Decode(padded.replace(/-/g, '+').replace(/_/g, '/'))).getDataAsString('UTF-8');
  }
}

/** Puts FlowHub's label on the thread, replacing any earlier FlowHub label. */
function applyLabel_(threadId, name) {
  var add = labelId_(name);
  var remove = allLabels_().filter(function (l) { return l.name.indexOf(LABEL_PREFIX) === 0 && l.id !== add; }).map(function (l) { return l.id; });
  Gmail.Users.Threads.modify({ addLabelIds: [add], removeLabelIds: remove }, 'me', threadId);
}

var labelsCache_ = null;
function allLabels_() {
  if (!labelsCache_) labelsCache_ = Gmail.Users.Labels.list('me').labels || [];
  return labelsCache_;
}

function labelId_(name) {
  var existing = allLabels_().filter(function (l) { return l.name === name; })[0];
  if (existing) return existing.id;
  var created = Gmail.Users.Labels.create({ name: name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, 'me');
  labelsCache_.push(created);
  return created.id;
}

function escape_(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
