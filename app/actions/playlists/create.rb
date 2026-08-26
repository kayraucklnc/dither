# frozen_string_literal: true

module Terminus
  module Actions
    module Playlists
      # The create action.
      class Create < Action
        include Deps[
          :htmx_layout,
          repository: "repositories.playlist",
          index_view: "views.playlists.index"
        ]

        params do
          required(:playlist).hash do
            required(:label).filled :string
            required(:name).filled :string
            required(:mode).filled :string
          end
        end

        def handle request, response
          parameters = request.params

          if parameters.valid?
            repository.create parameters[:playlist]
            response.render index_view, playlists: repository.all, layout: htmx_layout.call(request)
          else
            error response, parameters
          end
        end

        private

        def error response, parameters
          response.render view,
                          playlist: nil,
                          fields: parameters[:playlist],
                          errors: parameters.errors[:playlist],
                          layout: false
        end
      end
    end
  end
end
