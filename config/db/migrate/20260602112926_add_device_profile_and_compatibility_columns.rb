# frozen_string_literal: true

ROM::SQL.migration do
  change do
    add_column :device, :display_compatibility, :boolean, null: false, default: false
    add_column :device, :display_profile, String, null: false, default: "default"
    add_column :device, :firmware_profile, :boolean, null: false, default: false
    add_column :device, :touch_bar, String, null: false, default: "tap"
  end
end
