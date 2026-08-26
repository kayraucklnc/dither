# frozen_string_literal: true

# Removes the inherited screen model.
#
# Playlists rotated a device through a fixed list of screens, and designs were
# hand-written HTML with no notion of what they could sit beside. Both are
# replaced: a scene is composed from extensions that declare their own shapes,
# and rules decide when a device shows one. Keeping either alongside the new
# model meant two live answers to "what does this device show", which is what
# made the device pages contradict each other.
#
# The screen table stays. It is not part of the old model - it is how any
# render, whatever produced it, reaches a device as an image.
ROM::SQL.migration do
  up do
    alter_table(:device) { drop_column :playlist_id }
    alter_table(:screen) { drop_column :template_id }

    drop_table :playlist_item
    drop_table :playlist
    drop_table :screen_template
  end

  down do
    create_table :screen_template do
      primary_key :id
      column :name, :text, null: false, index: {unique: true}
      column :label, :text, null: false
      column :content, :text, null: false
      column :created_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
      column :updated_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
    end

    create_table :playlist do
      primary_key :id
      column :label, :text, null: false
      column :name, :text, null: false, index: {unique: true}
      column :current_item_id, :integer
      column :mode, :text, null: false, default: "automatic"
      column :created_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
      column :updated_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
    end

    create_table :playlist_item do
      primary_key :id
      foreign_key :playlist_id, :playlist, null: false, on_delete: :cascade
      foreign_key :screen_id, :screen, on_delete: :cascade
      column :position, :integer, null: false, default: 0
      column :created_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
      column :updated_at, :timestamp, null: false, default: Sequel::CURRENT_TIMESTAMP
    end

    alter_table(:screen) { add_foreign_key :template_id, :screen_template, on_delete: :set_null }
    alter_table(:device) { add_foreign_key :playlist_id, :playlist, on_delete: :set_null }
  end
end
