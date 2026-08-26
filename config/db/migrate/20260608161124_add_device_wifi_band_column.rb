# frozen_string_literal: true

ROM::SQL.migration do
  change do
    add_column :device, :wifi_band, :float, null: false, default: 0
    rename_column :device, :wifi, :wifi_signal
  end
end
