# frozen_string_literal: true

require "hanami_helper"

RSpec.describe "Scene flow", :db do
  let(:model) { Factory[:model, label: "Waveshare", width: 800, height: 480] }

  it "saves a composed scene and lists it" do
    extension = Factory[:extension, label: "Clock", template: %(<div class="screen">Clock</div>)]

    visit routes.path(:scene_new)

    # The composer posts the same shape the browser builds up as you place
    # extensions; this exercises the server half of that contract.
    page.driver.post routes.path(:scenes),
                     label: "Morning",
                     layout: "full",
                     model_id: model.id,
                     slots: {main: extension.id}

    visit routes.path(:scenes)

    aggregate_failures do
      expect(page).to have_text("Morning")
      expect(page).to have_text("1 of 1 slots filled")
    end
  end

  it "refuses a scene with no name" do
    page.driver.post routes.path(:scenes), label: "", layout: "full"

    visit routes.path(:scenes)

    expect(page).to have_text("No scenes yet")
  end

  it "serves the resolved scene to a device" do
    extension = Factory[:extension, label: "Clock", template: %(<div class="screen">Clock</div>)]
    scene = Factory[:scene, label: "Morning", layout: "full", model_id: model.id]
    Factory[:scene_slot, scene_id: scene.id, slot_key: "main", extension_id: extension.id]
    device = Factory[:device, model_id: model.id, label: "Hallway"]
    Factory[:rule, device_id: device.id, scene_id: scene.id, position: 0]

    screen = Hanami.app["aspects.screens.fetcher"].call Hanami.app["repositories.device"].find(device.id)

    expect(screen).to be_success
    expect(screen.value!.label).to eq "Morning"
  end

end
