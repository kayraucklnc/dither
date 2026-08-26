# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Devices::Provisioner, :db do
  subject(:provisioner) { described_class.new }

  describe "#call" do
    it "answers existing device with redacted API key" do
      device = Factory[:device, mac_address: "02:A1:B2:C3:D4:E5"]
      result = provisioner.call mac_address: device.mac_address

      expect(result.success).to have_attributes(
        api_key: "",
        mac_address: "02:A1:B2:C3:D4:E5"
      )
    end

    context "with firmware reset" do
      let(:device) { Factory[:device, mac_address: "02:A1:B2:C3:D4:E5", firmware_reset: true] }

      it "answers existing device with API key when firmware reset is enabled" do
        result = provisioner.call mac_address: device.mac_address

        expect(result.success).to have_attributes(
          api_key: device.api_key,
          mac_address: "02:A1:B2:C3:D4:E5"
        )
      end

      it "answers existing device with redacted API key after firmware reset is disabled" do
        provisioner.call mac_address: device.mac_address
        result = provisioner.call mac_address: device.mac_address

        expect(result.success).to have_attributes(
          api_key: "",
          mac_address: "02:A1:B2:C3:D4:E5"
        )
      end
    end

    context "with new device" do
      let(:model) { Factory[:model] }

      it "answers device with given MAC address" do
        result = provisioner.call mac_address: "02:A1:B2:C3:D4:E5", model_id: model.id

        expect(result.success).to have_attributes(
          model_id: model.id,
          mac_address: "02:A1:B2:C3:D4:E5"
        )
      end

      it "answers device with virtual MAC address" do
        result = provisioner.call model_id: model.id

        expect(result.success).to have_attributes(
          model_id: model.id,
          mac_address: match_mac_address
        )
      end

      # A new device is given something to show and nothing else. What it shows
      # afterwards comes from rules, which are the owner's to write.
      it "creates a welcome screen" do
        device = provisioner.call(mac_address: "02:A1:B2:C3:D4:E5", model_id: model.id).success
        screen = Dither::Repositories::Screen.new.find_by device_id: device.id

        expect(screen).to have_attributes(label: /Welcome/, kind: "welcome")
      end

      it "gives a new device no rules" do
        device = provisioner.call(mac_address: "02:A1:B2:C3:D4:E5", model_id: model.id).success

        expect(Dither::Repositories::Rule.new.for_device(device.id)).to be_empty
      end
    end
  end
end
