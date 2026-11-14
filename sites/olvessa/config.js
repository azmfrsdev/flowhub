/*
 * The site's settings (PRD 7.30, ADR-0022). Change them here, then redeploy.
 *
 * formEmbedUrl: the Google Form's embed address. Run createLeadForm() in the
 *   FlowHub Gmail script; its log prints "Embed address for the website",
 *   which ends in "/viewform?embedded=true". Leave it empty and the form
 *   section says the form isn't connected yet.
 * flowhubUrl: where the footer's FlowHub link goes.
 */
window.OLVESSA_CONFIG = {
  formEmbedUrl: "",
  flowhubUrl: "https://flowhub-331382621697.asia-southeast1.run.app",
};
