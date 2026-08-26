# frozen_string_literal: true

require "hanami_helper"

# Visits every page the dashboard offers and fails on a server error.
#
# This exists because deleting the playlist model left views exposing counts
# for relations that no longer existed, and nothing caught it until a person
# logged in and hit a stack trace. A page that raises is a bug regardless of
# what it was supposed to show.
RSpec.describe "Every page", :db do
  let(:model) { Factory[:model, width: 800, height: 480] }
  let(:device) { Factory[:device, model_id: model.id] }
  let(:extension) { Factory[:extension] }
  let(:scene) { Factory[:scene] }
  let(:firmware) { Factory[:firmware] }
  let(:user) { Factory[:user, :verified] }

  def pages
    {
      "dashboard" => routes.path(:root),
      "devices" => routes.path(:devices),
      "device" => routes.path(:device, id: device.id),
      "device edit" => routes.path(:device_edit, id: device.id),
      "device new" => routes.path(:device_new),
      "device logs" => routes.path(:device_logs, device_id: device.id),
      "device rules" => routes.path(:device_rules, device_id: device.id),
      "compose" => routes.path(:scene_new),
      "scenes" => routes.path(:scenes),
      "extensions" => routes.path(:extensions),
      "extension new" => routes.path(:extension_new),
      "extension edit" => routes.path(:extension_edit, id: extension.id),
      "extension exchanges" => routes.path(:extension_exchanges, extension_id: extension.id),
      "extension sources" => routes.path(:extension_sources, extension_id: extension.id),
      "extension sensors" => routes.path(:extension_sensors, extension_id: extension.id),
      "models" => routes.path(:models),
      "model" => routes.path(:model, id: model.id),
      "model new" => routes.path(:model_new),
      "model edit" => routes.path(:model_edit, id: model.id),
      "firmware" => routes.path(:firmwares),
      "firmware show" => routes.path(:firmware, id: firmware.id),
      "firmware new" => routes.path(:firmware_new),
      "flash" => routes.path(:flash),
      "users" => routes.path(:users),
      "user" => routes.path(:user, id: user.id),
      "problem details" => routes.path(:problem_details)
    }
  end

  it "renders without a server error", :aggregate_failures do
    scene

    pages.each do |name, path|
      visit path
      expect(page).to have_no_text("Puma caught this error"), "#{name} (#{path}) raised"
      expect(page).to have_no_text("undefined local variable"), "#{name} (#{path}) raised"
      expect(page).to have_no_text("uninitialized constant"), "#{name} (#{path}) raised"
    end
  end
end
