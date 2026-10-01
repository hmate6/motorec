Pod::Spec.new do |s|
  s.name           = 'OverlayRenderer'
  s.version        = '1.0.0'
  s.summary        = 'MotoRec overlay renderer'
  s.description    = 'Burns speed and lean angle overlay into recorded videos'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreImage', 'Photos', 'UIKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
