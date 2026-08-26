# frozen_string_literal: true

ROM::SQL.migration do
  change do
    add_column :device, :charging, :boolean, null: false, default: false
    add_column :device, :image_cached, :boolean, null: false, default: false
    add_column :device, :wake_duration, :integer, null: false, default: 0
  end
end
