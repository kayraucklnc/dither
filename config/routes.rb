# frozen_string_literal: true

require "rack/attack"
require "sidekiq/web"

require "sidekiq-scheduler/web"

module Dither
  # The application base routes.
  # rubocop:todo-next Metrics/ClassLength
  class Routes < Hanami::Routes
    # Order matters.
    use Rack::Attack
    use Rack::Static,
        root: "public",
        urls: ["/.well-known/security.txt", "/downloads", "/fonts", "/uploads"]
    use Rack::Deflater

    slice :authentication, at: "/" do
      use Authentication::Middleware
      mount Middleware::SidekiqAuth.new(Sidekiq::Web), at: "/sidekiq"
    end

    get "/", to: "dashboard.show", as: :root

    # rubocop:todo-next Metrics/BlockLength
    scope "api" do
      get "/devices", to: "api.devices.index", as: :devices
      get "/devices/:id", to: "api.devices.show", as: :device
      post "/devices", to: "api.devices.create", as: :devices
      patch "/devices/:id", to: "api.devices.patch", as: :device
      delete "/devices/:id", to: "api.devices.delete", as: :device

      resource :display, to: "api.display", only: :show

      get "/firmware", to: "api.firmware.index", as: :firmwares
      get "/firmware/:id", to: "api.firmware.show", as: :firmware
      post "/firmware", to: "api.firmware.create", as: :firmwares
      patch "/firmware/:id", to: "api.firmware.patch", as: :firmware
      delete "/firmware/:id", to: "api.firmware.delete", as: :firmware

      resource :log, to: "api.log", only: :create

      get "/models", to: "api.models.index", as: :models
      get "/models/:id", to: "api.models.show", as: :model
      post "/models", to: "api.models.create", as: :models
      patch "/models/:id", to: "api.models.patch", as: :model
      delete "/models/:id", to: "api.models.delete", as: :model

      get "/screens", to: "api.screens.index", as: :screens
      post "/screens", to: "api.screens.create", as: :screens
      patch "/screens/:id", to: "api.screens.patch", as: :screen
      delete "/screens/:id", to: "api.screens.delete", as: :screen

      resource :setup, to: "api.setup", only: :show
    end

    scope "bulk" do
      delete "/devices/:device_id/logs", to: "bulk.devices.logs.delete", as: :device_log
      delete "/firmware", to: "bulk.firmware.delete", as: :firmware
    end

    get "/devices", to: "devices.index", as: :devices
    get "/devices/:id", to: "devices.show", as: :device
    get "/devices/new", to: "devices.new", as: :device_new
    post "/devices", to: "devices.create", as: :devices
    get "/devices/:id/edit", to: "devices.edit", as: :device_edit
    put "/devices/:id", to: "devices.update", as: :device
    delete "/devices/:id", to: "devices.delete", as: :device

    get "/devices/:device_id/logs", to: "devices.logs.index", as: :device_logs
    get "/devices/:device_id/logs/:id", to: "devices.logs.show", as: :device_log
    delete "/devices/:device_id/logs/:id", to: "devices.logs.delete", as: :device_log

    get "/extensions", to: "extensions.index", as: :extensions
    get "/extensions/new", to: "extensions.new", as: :extension_new
    post "/extensions", to: "extensions.create", as: :extensions
    get "/extensions/:id/edit", to: "extensions.edit", as: :extension_edit
    put "/extensions/:id", to: "extensions.update", as: :extension
    delete "/extensions/:id", to: "extensions.delete", as: :extension

    post "/extensions/import", to: "extensions.import.create", as: :extension_import

    post "/extensions/:extension_id/build", to: "extensions.build.create", as: :extension_build

    get "/extensions/:extension_id/clone/new", to: "extensions.clone.new", as: :extension_clone_new
    post "/extensions/:extension_id/clone", to: "extensions.clone.create", as: :extension_clone

    get "/extensions/:extension_id/exchanges",
        to: "extensions.exchanges.index",
        as: :extension_exchanges
    get "/extensions/:extension_id/exchanges/new",
        to: "extensions.exchanges.new",
        as: :extension_exchange_new
    post "/extensions/:extension_id/exchanges",
         to: "extensions.exchanges.create",
         as: :extension_exchanges
    get "/extensions/:extension_id/exchanges/:id/edit",
        to: "extensions.exchanges.edit",
        as: :extension_exchange_edit
    put "/extensions/:extension_id/exchanges/:id",
        to: "extensions.exchanges.update",
        as: :extension_exchange
    delete "/extensions/:extension_id/exchanges/:id",
           to: "extensions.exchanges.delete",
           as: :extension_exchange

    get "/transit/catalog", to: "transit.catalog.index", as: :transit_catalog
    get "/transit/stations", to: "transit.stations.index", as: :transit_stations

    get "/extensions/:extension_id/export", to: "extensions.export.show", as: :extension_export
    get "/extensions/:extension_id/preview", to: "extensions.preview.show", as: :extension_preview
    get "/extensions/:extension_id/sources", to: "extensions.sources.index", as: :extension_sources
    get "/extensions/:extension_id/sensors", to: "extensions.sensors.index", as: :extension_sensors

    get "/firmware", to: "firmware.index", as: :firmwares
    get "/firmware/:id", to: "firmware.show", as: :firmware
    get "/firmware/new", to: "firmware.new", as: :firmware_new
    post "/firmware", to: "firmware.create", as: :firmwares
    get "/firmware/:id/edit", to: "firmware.edit", as: :firmware_edit
    put "/firmware/:id", to: "firmware.update", as: :firmware
    delete "/firmware/:id", to: "firmware.delete", as: :firmware

    get "/models", to: "models.index", as: :models
    get "/models/:id", to: "models.show", as: :model
    get "/models/new", to: "models.new", as: :model_new
    post "/models", to: "models.create", as: :models
    get "/models/:id/edit", to: "models.edit", as: :model_edit
    put "/models/:id", to: "models.update", as: :model
    delete "/models/:id", to: "models.delete", as: :model

    get "/models/:model_id/clone/new", to: "models.clone.new", as: :model_clone_new
    post "/models/:model_id/clone", to: "models.clone.create", as: :model_clone

    # The composer is a tool, not a sub-resource of the library, and nesting
    # it under /scenes made both navigation items light up at once.
    get "/compose", to: "scenes.new", as: :scene_new

    get "/scenes", to: "scenes.index", as: :scenes
    post "/scenes", to: "scenes.create", as: :scenes
    delete "/scenes/:id", to: "scenes.delete", as: :scene
    get "/scenes/preview", to: "scenes.preview.show", as: :scene_preview
    get "/scenes/:id/preview", to: "scenes.preview.show", as: :scene_image

    get "/devices/:device_id/rules", to: "devices.rules.index", as: :device_rules
    post "/devices/:device_id/rules", to: "devices.rules.create", as: :device_rules
    delete "/devices/:device_id/rules/:id", to: "devices.rules.delete", as: :device_rule
    post "/devices/:device_id/rules/:id/move", to: "devices.rules.reorder", as: :device_rule_move
    resources :problem_details, to: "problem_details", only: :index

    get "/flash", to: "flash.index", as: :flash

    get "/users", to: "users.index", as: :users
    get "/users/:id", to: "users.show", as: :user
    get "/users/new", to: "users.new", as: :user_new
    post "/users", to: "users.create", as: :users
    get "/users/:id/edit", to: "users.edit", as: :user_edit
    put "/users/:id", to: "users.update", as: :user

    slice(:health, at: "/up") { root to: "show" }
  end
end
