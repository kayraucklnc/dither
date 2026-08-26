# frozen_string_literal: true

require "dry/monads"

module Dither
  module Aspects
    module Scenes
      # Answers which scene a device should be showing right now.
      #
      # Rules are ordered and the first whose condition holds wins. That is the
      # entire conflict resolution story: several conditions being true at once
      # is normal and expected, and priority decides, never evaluation order or
      # whichever row the database happened to return first.
      #
      # A device with no matching rule gets nothing rather than a guess. Falling
      # back to "some scene" would make a misconfigured device look configured,
      # which is the most expensive kind of wrong on a display you glance at.
      class Resolver
        include Deps[rule_repository: "repositories.rule"]
        include Dry::Monads[:result]

        Decision = Data.define :rule, :scene, :considered do
          def refresh_rate = rule.refresh_rate
        end

        def call device, now: Time.now
          rules = rule_repository.for_device device.id

          return Failure no_rules(device) if rules.empty?

          match = rules.find { it.holds? device, now: }

          return Failure no_match(device, rules) unless match
          return Failure missing_scene(match) unless match.scene

          Success Decision[rule: match, scene: match.scene, considered: rules.size]
        end

        private

        def no_rules device
          "#{device.label} has no rules yet, so there is nothing to show. " \
          "Add one to say when a scene appears."
        end

        def no_match device, rules
          "None of #{device.label}'s #{rules.size} rules match right now. " \
          "Add a rule with no condition at the bottom to give it a default."
        end

        def missing_scene rule
          "Rule #{rule.id} points at a scene that no longer exists."
        end
      end
    end
  end
end
