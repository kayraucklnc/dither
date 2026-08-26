# frozen_string_literal: true

namespace :transit do
  desc "Package a transit extension preset as an importable archive"
  task :preset, [:name] do |_task, arguments|
    require "zip"

    name = arguments.fetch :name, "milan_trenord"
    source = Pathname("lib/presets/transit").join(name)
    abort "Unknown transit preset: #{name}." unless source.directory?

    target = Pathname("tmp").tap(&:mkpath).join("#{name.tr "_", "-"}.zip")
    target.delete if target.exist?

    Zip::File.open target, create: true do |archive|
      source.children.sort.each { archive.add it.basename.to_s, it.to_s }
    end

    puts "Packaged #{target}. Import it via Extensions -> Import."
  end
end
