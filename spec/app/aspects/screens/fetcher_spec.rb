# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Screens::Fetcher, :db do
  subject(:fetcher) { described_class.new }

  let(:model) { Factory[:model, width: 800, height: 480] }
  let(:device) { Dither::Aspects::Devices::Provisioner.new.call(model_id: model.id).value! }
  let(:repository) { Dither::Repositories::Device.new }

  describe "#call" do
    it "answers the sleep screen when the device is asleep" do
      allow(device).to receive(:asleep?).and_return true

      expect(fetcher.call(device).success).to have_attributes(label: /Sleep/)
    end

    it "answers the welcome screen when the device has no rules" do
      expect(fetcher.call(device).success).to have_attributes(label: /Welcome/)
    end

    it "answers the scene a matching rule points at" do
      extension = Factory[:extension, template: %(<div class="screen">Hi</div>)]
      scene = Factory[:scene, label: "Morning", layout: "full", model_id: model.id]
      Factory[:scene_slot, scene_id: scene.id, slot_key: "main", extension_id: extension.id]
      Factory[:rule, device_id: device.id, scene_id: scene.id, position: 0]

      expect(fetcher.call(repository.find(device.id)).success).to have_attributes(label: "Morning")
    end

    it "falls back to welcome when no rule matches" do
      scene = Factory[:scene, label: "Morning", layout: "full"]
      Factory[:rule, device_id: device.id, scene_id: scene.id, position: 0,
              condition_kind: "battery_below", settings: {"percent" => 0}]

      expect(fetcher.call(repository.find(device.id)).success).to have_attributes(label: /Welcome/)
    end

    it "prefers the higher rule when two match" do
      extension = Factory[:extension, template: %(<div class="screen">Hi</div>)]
      first = Factory[:scene, label: "First", name: "first", layout: "full", model_id: model.id]
      second = Factory[:scene, label: "Second", name: "second", layout: "full", model_id: model.id]
      Factory[:scene_slot, scene_id: first.id, slot_key: "main", extension_id: extension.id]
      Factory[:scene_slot, scene_id: second.id, slot_key: "main", extension_id: extension.id]
      Factory[:rule, device_id: device.id, scene_id: first.id, position: 0]
      Factory[:rule, device_id: device.id, scene_id: second.id, position: 1]

      expect(fetcher.call(repository.find(device.id)).success).to have_attributes(label: "First")
    end
  end
end
