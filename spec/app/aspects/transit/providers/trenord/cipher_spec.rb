# frozen_string_literal: true

require "hanami_helper"
require "openssl"

RSpec.describe Dither::Aspects::Transit::Providers::Trenord::Cipher do
  subject(:cipher) { described_class.new settings: }

  let(:passphrase) { "8hI&WK=1NQ55*f^yyZkdEGWYyN{S" }
  let(:settings) { Struct.new(:trenord_passphrase).new passphrase }

  def encrypt content, secret = passphrase
    encipher = OpenSSL::Cipher.new("aes-256-ecb").encrypt
    encipher.key = OpenSSL::Digest::SHA256.digest secret

    encipher.update(content) + encipher.final
  end

  describe "#call" do
    it "answers parsed JSON" do
      payload = encrypt %({"solutions":[{"dep_time":"22:43:00"}]})

      expect(cipher.call(payload)).to be_success({"solutions" => [{"dep_time" => "22:43:00"}]})
    end

    it "answers failure when the passphrase has rotated" do
      payload = encrypt %({"solutions":[]}), "a different passphrase"

      expect(cipher.call(payload)).to be_failure(
        "Unable to decrypt Trenord response (the passphrase may have rotated)."
      )
    end

    it "answers failure for non-JSON plaintext" do
      expect(cipher.call(encrypt("not json at all"))).to be_failure(
        "Decrypted Trenord response is not JSON (the passphrase may have rotated)."
      )
    end
  end
end
