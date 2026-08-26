# frozen_string_literal: true

module Terminus
  module Actions
    module Playlists
      module Mirror
        # The edit action.
        class Edit < Action
          include Deps[
            :htmx_layout,
            repository: "repositories.playlist",
            device_repository: "repositories.device"
          ]

          params { required(:playlist_id).filled :integer }

          def handle request, response
            parameters = request.params

            halt :unprocessable_content unless parameters.valid?

            response.render view,
                            playlist: repository.find(parameters[:playlist_id]),
                            devices: device_repository.all,
                            layout: htmx_layout.call(request)
          end
        end
      end
    end
  end
end
