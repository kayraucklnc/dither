# frozen_string_literal: true

ROM::SQL.migration { change { rename_column :extension, :body, :static_body } }
