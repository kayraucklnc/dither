# frozen_string_literal: true

# Renames the "terminus" kind to "dither".
#
# These values mean "native to this server", as opposed to "trmnl", which means
# it came from the upstream service. The upstream name stays: devices still run
# stock TRMNL firmware and that distinction is real. Only our own name changes.
#
# Nothing a device sees is affected - kind appears only in the dashboard-facing
# firmware API, never in /api/setup or /api/display.
ROM::SQL.migration do
  up do
    run "ALTER TYPE palette_kind RENAME VALUE 'terminus' TO 'dither';"
    # Re-stated explicitly: renaming a label does not rewrite a stored default.
    run "ALTER TABLE palette ALTER COLUMN kind SET DEFAULT 'dither';"

    run "ALTER TABLE model ALTER COLUMN kind DROP DEFAULT;"
    run "UPDATE model SET kind = 'dither' WHERE kind = 'terminus';"
    run "ALTER TABLE model ALTER COLUMN kind SET DEFAULT 'dither';"

    run "ALTER TABLE firmware ALTER COLUMN kind DROP DEFAULT;"
    run "UPDATE firmware SET kind = 'dither' WHERE kind = 'terminus';"
    run "ALTER TABLE firmware ALTER COLUMN kind SET DEFAULT 'dither';"
  end

  down do
    run "ALTER TABLE firmware ALTER COLUMN kind DROP DEFAULT;"
    run "UPDATE firmware SET kind = 'terminus' WHERE kind = 'dither';"
    run "ALTER TABLE firmware ALTER COLUMN kind SET DEFAULT 'terminus';"

    run "ALTER TABLE model ALTER COLUMN kind DROP DEFAULT;"
    run "UPDATE model SET kind = 'terminus' WHERE kind = 'dither';"
    run "ALTER TABLE model ALTER COLUMN kind SET DEFAULT 'terminus';"

    run "ALTER TYPE palette_kind RENAME VALUE 'dither' TO 'terminus';"
    run "ALTER TABLE palette ALTER COLUMN kind SET DEFAULT 'terminus';"
  end
end
