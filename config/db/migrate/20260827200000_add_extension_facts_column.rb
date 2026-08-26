# frozen_string_literal: true

# What an extension can be asked about.
#
# Conditions were a closed list, so a rule could ask about the battery but
# never about anything an extension knew. That makes the interesting triggers
# impossible: "a meeting starts within 30 minutes", "the next train is
# cancelled", "it is going to rain".
#
# An extension declares its facts and where to find each one in its own data.
# Anything declared becomes selectable in every condition editor, so adding a
# calendar connector adds calendar triggers without touching the rule engine.
ROM::SQL.migration do
  change do
    alter_table :extension do
      add_column :facts, :jsonb, default: "[]", null: false
    end
  end
end
