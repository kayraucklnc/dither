# frozen_string_literal: true

Hanami.app.register_provider :sidekiq, source: Dither::Providers::Sidekiq
