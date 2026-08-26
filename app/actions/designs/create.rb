# frozen_string_literal: true

module Terminus
  module Actions
    module Designs
      # The create action.
      class Create < Terminus::Action
        include Deps[
          "aspects.screens.upserter",
          repository: "repositories.screen_template",
          model_repository: "repositories.model"
        ]

        params do
          required(:model_id).filled :integer

          required(:design).hash do
            required(:label).filled :string
            required(:name).filled :string
            required(:content).filled :string
          end
        end

        def handle request, response
          parameters = request.params

          if parameters.valid?
            create_with_screen parameters, response
          else
            error response, parameters
          end
        end

        private

        def create_with_screen parameters, response
          screen_template = repository.create parameters[:design]

          upserter.call(model_id: parameters[:model_id], **screen_template.screen_attributes)
          response.redirect_to routes.path(:design_edit, id: screen_template.id)
        rescue Sequel::UniqueConstraintViolation
          # `name` is unique in the schema. Without this the violation escapes as
          # an unhandled 500 and the user loses everything they typed.
          error response, parameters, name: ["has already been taken."]
        end

        def error response, parameters, extra = {}
          response.render view,
                          models: model_repository.all,
                          template: nil,
                          fields: parameters[:design],
                          errors: parameters.errors[:design].to_h.merge(extra)
        end
      end
    end
  end
end
