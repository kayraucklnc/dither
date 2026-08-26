# frozen_string_literal: true

ROM::SQL.migration do
  change { run "ALTER TYPE extension_kind_enum ADD VALUE IF NOT EXISTS 'transit';" }
end
