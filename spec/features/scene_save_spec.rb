# frozen_string_literal: true

require "hanami_helper"

RSpec.describe "Saving a scene", :db, :js do
  it "saves from the composer through a real form submit" do
    model = Factory[:model, label: "Waveshare", width: 800, height: 480]
    extension = Factory[:extension, label: "Clock", template: %(<div class="screen">Clock</div>)]

    visit "#{routes.path :scene_new}?model_id=#{model.id}"

    find(%(.palette-item[data-extension-id="#{extension.id}"])).click
    find(".slot-target").click

    fill_in "label", with: "Hallway morning"
    click_button "Save scene"

    # A real submit, so this is the path that hit the CSRF failure.
    expect(page).to have_text("Hallway morning")
  end

  it "adds a rule through a real form submit" do
    model = Factory[:model, width: 800, height: 480]
    device = Factory[:device, model_id: model.id, label: "Hallway"]
    Factory[:scene, label: "Morning", name: "morning"]

    visit routes.path(:device_rules, device_id: device.id)

    pick_scene "Morning"
    select "Always", from: "condition_kind"
    click_button "Add rule"

    expect(page).to have_text("Show Morning always")
  end

  it "marks only the composer as current when composing" do
    visit routes.path(:scene_new)

    active = all(%(.site-menu a[data-state="active"])).map(&:text)

    expect(active).to eq ["Compose"]
  end
end
