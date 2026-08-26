# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Extensions::Contextualizer, :db do
  subject(:contextualizer) { described_class.new }

  using Refinements::Hash

  # An extension that declares nothing still gets the default full screen view.
  let :default_view do
    {
      "name" => "full",
      "label" => "Full screen",
      "shape" => "full",
      "description" => "Takes the whole screen.",
      "width" => {"min" => 200, "max" => 2_000, "ideal" => nil},
      "height" => {"min" => 120, "max" => 2_000, "ideal" => nil},
      "align" => %w[fill]
    }
  end

  describe "#call" do
    let :extension do
      Factory.structs[
        :extension,
        label: "Test",
        fields: [{"keyname" => "one", "default" => 1}],
        data: {"label" => "Test"}
      ]
    end

    let :model do
      Factory[
        :model,
        name: "test",
        css: {
          "classes" => {"size" => "screen--lg"},
          "variables" => [%w[--screen-w 1040px], %w[--screen-h 780px]]
        }
      ]
    end

    let(:device) { Factory[:device, model_id: model.id] }
    let(:sensor) { Factory[:device_sensor, device_id: device.id] }

    it "answers all attributes" do
      sensor

      expect(contextualizer.call(extension, model_id: model.id, device_id: device.id)).to eq(
        "extension" => {
          "label" => "Test",
          "data" => {"label" => "Test"},
          "fields" => [{"keyname" => "one", "default" => 1}],
          "values" => {"one" => 1},
          "css_classes" => "screen screen--test screen--1bit screen--landscape screen--lg",
          "device" => {"id" => device.id, "battery_percentage" => 70, "wifi_percentage" => 90}
        },
        "screen_variables" => "--screen-w: 1040px;\n--screen-h: 780px;",
        "sensors" => [
          {
            "device_id" => device.id,
            "kind" => "temperature",
            "make" => "ACME",
            "model" => "Test",
            "unit" => "celcius",
            "value" => 20.1,
            "source" => "device",
            "created_at" => Time.new(2025, 1, 1).utc
          }
        ],
        "view" => default_view.merge("size" => {"width" => 800, "height" => 480}),
        "views" => [default_view]
      )
    end

    it "answers the view a caller asks for" do
      extension = Factory.structs[
        :extension,
        data: {
          "views" => [
            {"name" => "full"},
            {"name" => "vertical", "label" => "Side rail", "shape" => "vertical"}
          ]
        }
      ]

      expect(contextualizer.call(extension, view: "vertical")["view"]).to include(
        "name" => "vertical",
        "shape" => "vertical",
        "label" => "Side rail"
      )
    end

    it "answers attributes without fields, values, model, and sensors" do
      extension = Factory.structs[:extension, label: "Test"]

      expect(contextualizer.call(extension)).to eq(
        "extension" => {
          "label" => "Test",
          "css_classes" => nil,
          "data" => {},
          "fields" => [],
          "values" => {},
          "device" => {}
        },
        "screen_variables" => nil,
        "sensors" => [],
        "view" => default_view.merge("size" => {"width" => 200, "height" => 120}),
        "views" => [default_view]
      )
    end
  end
end
