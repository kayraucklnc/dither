# frozen_string_literal: true

require_relative "../../app/providers/logger"

Hanami.app.register_provider :logger, source: Dither::Providers::Logger
