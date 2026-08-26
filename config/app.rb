# frozen_string_literal: true

require "hanami"
require "rfc/api/problem"

require_relative "initializers/universal_logger_patch"

module Dither
  # The application base configuration.
  class App < Hanami::App
    RubyVM::YJIT.enable if defined? RubyVM::YJIT
    Dry::Schema.load_extensions :monads
    Dry::Validation.load_extensions :monads

    config.inflections { it.acronym "DEFAULTS", "HTML", "IP", "MAC", "URI" }

    # Nothing off-origin. Screens render against the self-hosted framework in
    # lib/dither/screen_framework.css, so trmnl.com is no longer on the
    # critical path of anything and does not belong in the policy.
    config.actions.content_security_policy.then do |csp|
      csp[:manifest_src] = "'self'"
      csp[:script_src] += " 'unsafe-eval' 'unsafe-inline'"
    end

    config.actions.formats.register :problem_details, RFC::API::Problem::MEDIA_TYPE_JSON

    # rubocop:todo-next Layout/FirstArrayElementLineBreak
    config.actions.sessions = :cookie,
                              {
                                key: settings.session_cookie_key,
                                secret: settings.app_secret,
                                expire_after: 3_600 # 1 hour.
                              }
  end
end
