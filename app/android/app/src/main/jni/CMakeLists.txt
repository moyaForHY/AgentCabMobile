project(ncnn_ocr)

cmake_minimum_required(VERSION 3.10)

set(OpenCV_DIR ${CMAKE_SOURCE_DIR}/opencv-mobile-4.13.0-android/sdk/native/jni)
find_package(OpenCV REQUIRED core imgproc)

set(ncnn_DIR ${CMAKE_SOURCE_DIR}/ncnn-20260113-android/${ANDROID_ABI}/lib/cmake/ncnn)
find_package(ncnn REQUIRED)

set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fopenmp")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fopenmp")
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -fopenmp -static-openmp")

add_library(ncnn_ocr SHARED ocr_jni.cpp ppocrv5.cpp)

target_link_libraries(ncnn_ocr ncnn ${OpenCV_LIBS} android jnigraphics log)

add_library(ncnn_yolo SHARED yolo_icon.cpp)

target_link_libraries(ncnn_yolo ncnn android jnigraphics log)
