# frozen_string_literal: true

ROM::SQL.migration do
  change do
    create_enum :device_log_level_enum, %w[debug info warn error fatal any]
    add_column :device_log, :level, :device_log_level_enum, index: true, null: false, default: "any"
  end
end
