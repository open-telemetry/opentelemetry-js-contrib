{
  "targets": [{
    "target_name": "metrics",
    "sources": [
      "native/metrics/Collector.cpp",
      "native/metrics/EventLoop.cpp",
      "native/metrics/GarbageCollection.cpp",
      "native/metrics/Heap.cpp",
      "native/metrics/Histogram.cpp",
      "native/metrics/Object.cpp",
      "native/metrics/main.cpp"
    ],
    "include_dirs": [
      "native",
      "<!(node -e \"require('nan')\")"
    ],
    "xcode_settings": {
      "MACOSX_DEPLOYMENT_TARGET": "10.9",
      "OTHER_CFLAGS": [
        "-std=c++11",
        "-stdlib=libc++",
        "-Wall",
        "-Werror"
      ]
    },
    "conditions": [
      ["OS == 'linux'", {
        "cflags": [
          "-std=c++11",
          "-Wall",
          "-Werror"
        ],
        "cflags_cc": [
          "-Wno-cast-function-type"
        ]
      }],
      ["OS == 'win'", {
        "cflags": [
          "/WX"
        ]
      }]
    ]
  }]
}
