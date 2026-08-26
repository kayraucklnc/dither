# frozen_string_literal: true

# Representative data an extension ships with.
#
# Without this, an extension that has never fetched - because it is not
# configured yet, or its API is down, or you do not own the hardware yet -
# renders its empty state, and the composer shows a blank panel. That makes the
# product impossible to evaluate before committing to it, which is the one
# thing it most needs to be good at.
#
# Sample data is used only in previews, never in what a device is served, and
# only when there is no real data to show. It is always labelled as sample.
ROM::SQL.migration do
  change do
    alter_table :extension do
      add_column :sample, :jsonb, default: "{}", null: false
    end
  end
end
