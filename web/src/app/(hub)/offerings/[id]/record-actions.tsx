import { DeleteButton } from "@/components/flowhub/delete-button";
import { EditDialog, Field, SelectField } from "@/components/flowhub/edit-dialog";
import type { Offering } from "@/lib/schema";
import { deleteOffering, updateOffering } from "./actions";

/** Edit an offering's details, or delete it with its sub-offerings and pricing (R10). */
export function OfferingRecordActions({ offering, subOfferings }: { offering: Offering; subOfferings: number }) {
  return (
    <span className="flex items-center gap-1">
      <EditDialog title={`Edit ${offering.name}`} action={updateOffering.bind(null, offering.id)} trigger="text" triggerLabel="Edit details">
        <Field label="Name" name="name" defaultValue={offering.name} maxLength={120} required />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Type"
            name="type"
            defaultValue={offering.type}
            options={[
              { value: "service", label: "Service" },
              { value: "package", label: "Package" },
              { value: "product", label: "Product" },
            ]}
          />
          <SelectField
            label="Status"
            name="status"
            defaultValue={offering.status}
            options={[
              { value: "active", label: "Active" },
              { value: "pilot", label: "Pilot" },
              { value: "retired", label: "Retired" },
            ]}
          />
        </div>
        <Field label="Owner" name="owner" defaultValue={offering.owner ?? ""} maxLength={80} hint="optional" />
        <Field label="Summary" name="summary" defaultValue={offering.summary} multiline maxLength={300} />
        <Field label="What it is" name="description" defaultValue={offering.description} multiline maxLength={2000} hint="optional" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Typical length" name="typicalLength" defaultValue={offering.facts.typicalLength ?? ""} maxLength={80} placeholder="6 to 10 weeks" />
          <Field label="Best for" name="bestFor" defaultValue={offering.facts.bestFor ?? ""} maxLength={200} placeholder="Retailers with 20+ stores" />
        </div>
      </EditDialog>
      <DeleteButton
        action={deleteOffering.bind(null, offering.id)}
        label={`Delete ${offering.name}`}
        confirm={`Delete ${offering.name}${subOfferings ? ` and its ${subOfferings} sub-${subOfferings === 1 ? "offering" : "offerings"}` : ""}? Its pricing, exclusions, notes and the results that belong only to it go too.`}
      />
    </span>
  );
}
