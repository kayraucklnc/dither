# frozen_string_literal: true

# Scenes and the rules that choose between them.
#
# A scene is a layout with extensions in its slots - what a panel shows. A rule
# says when a device shows one. Rules are ordered and the first whose condition
# holds wins, so "many triggers at once" resolves by priority rather than by
# whichever happened to be evaluated first.
#
# The condition is a kind plus a bag of settings rather than a column per
# trigger type, so adding a new kind is a registry entry and a form, never a
# migration. See lib/dither/conditions.rb.
ROM::SQL.migration do
  change do
    create_table :scene do
      primary_key :id
      column :name, :text, null: false, index: {unique: true}
      column :label, :text, null: false
      column :layout, :text, null: false, default: "full"
      foreign_key :model_id, :model, on_delete: :set_null
      column :created_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
      column :updated_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
    end

    create_table :scene_slot do
      primary_key :id
      foreign_key :scene_id, :scene, null: false, on_delete: :cascade
      foreign_key :extension_id, :extension, on_delete: :cascade
      column :slot_key, :text, null: false
      column :created_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
      column :updated_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP

      index %i[scene_id slot_key], unique: true
    end

    create_table :rule do
      primary_key :id
      foreign_key :device_id, :device, null: false, on_delete: :cascade
      foreign_key :scene_id, :scene, null: false, on_delete: :cascade
      column :position, :integer, null: false, default: 0
      column :condition_kind, :text, null: false, default: "always"
      column :settings, :jsonb, null: false, default: "{}"
      # Overrides how often the device wakes while this rule is the one in
      # force, which is the whole point of a rule like "commuting".
      column :refresh_rate, :integer
      column :created_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
      column :updated_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP

      index %i[device_id position]
    end
  end
end
