# frozen_string_literal: true

ROM::SQL.migration do
  up do
    drop_column :extension, :headers
    drop_column :extension, :verb
    drop_column :extension, :uris
  end

  down do
    add_column :extension, :headers, :jsonb, null: false, default: "{}"
    add_column :extension, :verb, :extension_verb_enum, null: false, default: "get"
    add_column :extension, :uris, "text[]", null: false, default: "{}"
  end
end
