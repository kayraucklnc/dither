# frozen_string_literal: true

require "dry/monads"
require "initable"
require "json"
require "openssl"

module Dither
  module Aspects
    module Transit
      module Providers
        module Trenord
          # Decrypts Trenord's journey planner responses.
          #
          # The body is AES-256-ECB/PKCS7 under a key that is the raw SHA-256
          # digest of a passphrase shipped in Trenord's own JavaScript bundle.
          # It is obfuscation rather than security, but it is the only thing
          # standing between us and the JSON.
          #
          # The passphrase is a setting, not a constant, because it is the one
          # fragile part: a new bundle with a new passphrase breaks decryption
          # silently, and swapping an environment variable beats a deploy.
          class Cipher
            include Deps[:settings]
            include Initable[algorithm: "aes-256-ecb"]
            include Dry::Monads[:result]

            def call ciphertext
              Success JSON parse(ciphertext)
            rescue OpenSSL::Cipher::CipherError
              Failure "Unable to decrypt Trenord response (the passphrase may have rotated)."
            rescue JSON::ParserError
              Failure "Decrypted Trenord response is not JSON (the passphrase may have rotated)."
            end

            private

            def parse ciphertext
              decipher = OpenSSL::Cipher.new(algorithm).decrypt
              decipher.key = key
              (decipher.update(String(ciphertext).b) + decipher.final).force_encoding Encoding::UTF_8
            end

            def key = OpenSSL::Digest::SHA256.digest settings.trenord_passphrase
          end
        end
      end
    end
  end
end
