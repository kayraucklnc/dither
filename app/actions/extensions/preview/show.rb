# frozen_string_literal: true

module Terminus
  module Actions
    module Extensions
      module Preview
        # The show action.
        class Show < Action
          include Deps[
            "aspects.extensions.generator",
            repository: "repositories.extension",
            view: "views.extensions.dynamic"
          ]

          params do
            required(:extension_id).filled :integer
            required(:model_id).filled :integer
            required(:device_id).maybe :integer
            optional(:view).filled :string
          end

          def handle request, response
            parameters = request.params.to_h
            extension = repository.find parameters[:extension_id]

            halt :not_found unless extension

            response.render view, content: content_for(extension, parameters)
          end

          private

          def content_for extension, parameters
            model_id, device_id, name = parameters.values_at :model_id, :device_id, :view

            case generator.call extension, model_id:, device_id:, view: name
              in Success(content) then content
              in Failure(message) then message
              else "Unable to render body for extension: #{extension.id}."
            end
          end
        end
      end
    end
  end
end
