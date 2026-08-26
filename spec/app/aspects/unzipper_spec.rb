# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Unzipper do
  subject(:unzipper) { described_class.new }

  before { Hanami.app.start :zip }

  describe "#call" do
    let :io do
      stream = Zip::OutputStream.write_buffer do |buffer|
        buffer.put_next_entry "test.txt"
        buffer.write "Test"
      end

      stream.tap(&:rewind)
    end

    it "answers extracted attributes" do
      expect(unzipper.call(io)).to be_success("test.txt" => "Test")
    end

    it "answers failure when type error" do
      expect(unzipper.call(StringIO.new)).to be_failure(
        "No implicit conversion of StringIO into String"
      )
    end

    it "answers failure when zip can't be decompressed" do
      file = class_double Zip::File
      unzipper = described_class.new(file:)

      allow(file).to receive(:open_buffer).and_raise Zip::Error, "Danger!"

      expect(unzipper.call(666)).to be_failure("Danger!")
    end

    context "with directory entry" do
      let :io do
        Zip::OutputStream.write_buffer { |buffer| buffer.put_next_entry "bogus/" }
                         .tap(&:rewind)
      end

      it "answers failure" do
        expect(unzipper.call(io)).to be_failure("Directories are not allowed.")
      end
    end

    context "with maximum files" do
      let :io do
        stream = Zip::OutputStream.write_buffer do |buffer|
          11.times do |number|
            buffer.put_next_entry "#{number}.txt"
            buffer.write number.to_s
          end
        end

        stream.tap(&:rewind)
      end

      it "answers failure" do
        expect(unzipper.call(io)).to be_failure("File limit exceeded: 11 (actual), 10 (maximum).")
      end
    end

    context "with maximum file size" do
      let :io do
        stream = Zip::OutputStream.write_buffer do |buffer|
          buffer.put_next_entry "test.txt"
          buffer.write "x" * 1048577 # 1.1 MB
        end

        stream.tap(&:rewind)
      end

      it "answers failure" do
        expect(unzipper.call(io)).to be_failure(
          "File size exceeded (test.txt): 1048577 (actual), 1048576 (maximum)."
        )
      end
    end
  end
end
