# frozen_string_literal: true

require "hanami_helper"
require "http"
require "trmnl/api"

RSpec.describe Terminus::Aspects::Fonts::Synchronizer do
  using Refinements::Pathname

  subject(:synchronizer) { described_class.new downloader: }

  include_context "with application dependencies"

  let(:downloader) { instance_double Terminus::Aspects::Downloader, call: response }

  let :response do
    Success(
      HTTP::Response.new(
        uri: "https://trmnl-oss.s3-us-east-2.amazonaws.com/fonts/test.ttf",
        body: [123].pack("N"),
        status: 200,
        version: 1.0
      )
    )
  end

  describe "#call" do
    it "deletes unknown files" do
      temp_dir.join("test.txt").touch
      synchronizer.call

      expect(temp_dir.files).not_to include(temp_dir.join("test.txt"))
    end

    it "doesn't download files that exist" do
      downloader = instance_double Terminus::Aspects::Downloader, call: Failure("Skip.")
      synchronizer = described_class.new(downloader:)

      temp_dir.join("BlockKie.ttf").touch
      synchronizer.call

      expect(temp_dir.files).to contain_exactly(temp_dir.join("BlockKie.ttf"))
    end

    it "answers failures when downloader fails" do
      allow(downloader).to receive(:call).and_return(Failure("Danger!"))
      expect(synchronizer.call).to include(Failure("Danger!"))
    end

    it "downloads remote files" do
      synchronizer.call

      proof = YAML.load_file(Hanami.app.root.join("config/fonts.yml"))
                  .fetch("names")
                  .map { |name| temp_dir.join name }

      expect(temp_dir.files).to eq(proof)
    end

    context "with failure" do
      subject(:synchronizer) { described_class.new configuration_path:, downloader: }

      let(:response) { Failure "Danger!" }
      let(:configuration_path) { temp_dir.join("fonts.yml").write("names:\n  - test.txt") }

      it "answers message" do
        expect(synchronizer.call).to contain_exactly(Failure("Danger!"))
      end
    end
  end
end
