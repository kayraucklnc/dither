# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Screens::Rotator, :db do
  subject(:rotator) { described_class.new }

  let(:model) { Factory[:model, width: 800, height: 480] }
  let(:device) { Dither::Aspects::Devices::Provisioner.new.call(model_id: model.id).value! }

  describe "#call" do
    it "answers the sleep screen when the device is asleep" do
      allow(device).to receive(:asleep?).and_return true

      expect(rotator.call(device).success).to have_attributes(label: /Sleep/)
    end

    it "answers the welcome screen when nothing is configured" do
      expect(rotator.call(device).success).to have_attributes(label: /Welcome/)
    end
  end
end
