# frozen_string_literal: true

# The TRMNL API client.
#
# Still here on purpose: devices run stock firmware, so official firmware
# releases, hardware models and palettes come from TRMNL. The recipe gallery
# that used to point a second client at trmnl.com is gone - screens are built
# from extensions in this dashboard now, not imported from someone else's
# catalogue.
Hanami.app.register_provider :trmnl_api do
  prepare { require "trmnl/api" }

  start do
    slice.start :http
    TRMNL::API::Container.merge slice, :http, :logger

    register :trmnl_api, TRMNL::API.new
  end
end
