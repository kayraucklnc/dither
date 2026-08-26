# frozen_string_literal: true

module Dither
  module Actions
    module Scenes
      # The delete action.
      class Delete < Action
        include Deps[repository: "repositories.scene"]

        params { required(:id).filled :integer }

        def handle request, response
          repository.delete request.params[:id]
          response.flash[:notice] = "Scene deleted."
          response.redirect_to routes.path(:scenes)
        end
      end
    end
  end
end
