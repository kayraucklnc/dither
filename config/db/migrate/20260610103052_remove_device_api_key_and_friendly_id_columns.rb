# frozen_string_literal: true

ROM::SQL.migration do
  up do
    drop_column :device, :api_key
    drop_column :device, :friendly_id
  end

  down do
    add_column :device, :api_key, String
    add_column :device, :friendly_id, String
  end
end
