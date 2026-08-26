# frozen_string_literal: true

# Per-shape templates for an extension.
#
# The `template` column stays the full-page variant, so every extension that
# already exists is valid with an empty hash here. This column holds the
# additional shapes the author chose to design for - half width, a quarter, and
# so on. An absent key means the extension cannot occupy that shape, which is
# the whole point: the composer offers only what was actually designed.
#
# See lib/dither/layouts.rb for the shape vocabulary.
ROM::SQL.migration do
  change do
    alter_table :extension do
      add_column :variants, :jsonb, default: "{}", null: false
    end
  end
end
