# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Actions::Extensions::Import::Create, :db do
  using Refinements::Pathname

  subject(:action) { described_class.new }

  describe "#call" do
    let(:exporter) { Terminus::Aspects::Extensions::Exporter.new }
    let(:extension) { Factory.structs[:extension] }

    it "renders errors when invalid" do
      allow(extension).to receive(:export_attributes).and_return({})

      response = action.call Rack::MockRequest.env_for(
        "",
        "router.params" => {
          extension: {
            attachment: {
              name: "test",
              type: "application/zip",
              head: "test",
              filename: "test.zip",
              tempfile: exporter.call(extension).value!
            }
          }
        }
      )

      expect(response.flash.inspect).to include("label is missing")
    end

    it "flashs success when valid" do
      response = action.call Rack::MockRequest.env_for(
        "",
        "router.params" => {
          extension: {
            attachment: {
              name: "test",
              type: "application/zip",
              head: "test",
              filename: "test.zip",
              tempfile: exporter.call(extension).value!
            }
          }
        }
      )

      expect(response.flash.inspect).to include("Extension imported!")
    end

    it "answers unprocessable content when parameters are missing" do
      response = Rack::MockRequest.new(action).post("")
      expect(response.status).to eq(422)
    end
  end
end
