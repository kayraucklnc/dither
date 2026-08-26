# frozen_string_literal: true

Factory.define :user_password_hash, relation: :user_password_hash do |factory|
  factory.password_hash { Dither::Aspects::PasswordEncryptor.new.call "password" }
end
