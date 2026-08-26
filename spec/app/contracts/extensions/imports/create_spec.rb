# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Contracts::Extensions::Imports::Create do
  subject(:contract) { described_class.new }

  describe "#call" do
    let(:io) { StringIO.new }

    let :attributes do
      {
        extension: {
          attachment: {
            name: "test",
            type: "application/zip",
            head: "what",
            filename: "attachment.zip",
            tempfile: io
          }
        }
      }
    end

    it "answers true when valid" do
      expect(contract.call(attributes).success?).to be(true)
    end

    it "answers false when attachment size is too large" do
      io.write "x" * 512_001

      expect(contract.call(attributes).errors.to_h).to eq(
        extension: {attachment: ["must be less than 500.0 KB"]}
      )
    end
  end
end
