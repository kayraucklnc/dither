# frozen_string_literal: true

require "hanami_helper"

RSpec.describe "Rules", :db do
  let(:model) { Factory[:model, label: "Waveshare", width: 800, height: 480] }
  let(:device) { Factory[:device, model_id: model.id, label: "Hallway"] }
  let(:scene) { Factory[:scene, label: "Morning", layout: "full"] }

  describe "the stack" do
    it "shows nothing until a rule exists" do
      visit routes.path(:device_rules, device_id: device.id)

      expect(page).to have_text("has no rules yet")
    end

    it "adds a rule and names what is showing" do
      scene
      visit routes.path(:device_rules, device_id: device.id)

      select "Morning", from: "scene_id"
      select "Always", from: "condition_kind"
      click_button "Add rule"

      expect(page).to have_text("Show Morning always")
    end

    it "prefers the higher rule when several match" do
      night = Factory[:scene, label: "Night", name: "night"]
      Factory[:rule, device_id: device.id, scene_id: scene.id, position: 0]
      Factory[:rule, device_id: device.id, scene_id: night.id, position: 1]

      visit routes.path(:device_rules, device_id: device.id)

      within ".rules-now" do
        expect(page).to have_text("Morning")
      end
    end

    it "reorders so a lower rule can take over" do
      night = Factory[:scene, label: "Night", name: "night"]
      Factory[:rule, device_id: device.id, scene_id: scene.id, position: 0]
      Factory[:rule, device_id: device.id, scene_id: night.id, position: 1]

      visit routes.path(:device_rules, device_id: device.id)
      all("button[title='Higher priority']").last.click

      within ".rules-now" do
        expect(page).to have_text("Night")
      end
    end
  end

  describe "conditions" do
    it "skips a rule whose condition does not hold" do
      Factory[:rule, device_id: device.id, scene_id: scene.id, position: 0,
              condition_kind: "battery_below", settings: {"percent" => 5}]

      visit routes.path(:device_rules, device_id: device.id)

      expect(page).to have_text("None of Hallway's 1 rules match")
    end

    it "matches a battery rule when the battery is low" do
      # battery_percentage is derived from the charge, not stored.
      low = Factory[:device, model_id: model.id, label: "Low", battery_charge: 4.0]
      Factory[:rule, device_id: low.id, scene_id: scene.id, position: 0,
              condition_kind: "battery_below", settings: {"percent" => 20}]

      visit routes.path(:device_rules, device_id: low.id)

      within ".rules-now" do
        expect(page).to have_text("Morning")
      end
    end
  end
end
