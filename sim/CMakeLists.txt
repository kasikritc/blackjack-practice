cmake_minimum_required(VERSION 3.24)
project(blackjack_strategy_sim LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 20)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)


add_library(sim_cuda OBJECT src/cuda_probe.cu)
set_target_properties(sim_cuda PROPERTIES CUDA_ARCHITECTURES native)

add_executable(simulate-strategy
  src/main.cpp
  src/simulator.cpp
  src/artifacts.cpp
  $<TARGET_OBJECTS:sim_cuda>
)

target_include_directories(simulate-strategy PRIVATE src)
