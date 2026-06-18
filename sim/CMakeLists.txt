cmake_minimum_required(VERSION 3.24)
project(blackjack_strategy_sim LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 20)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

find_package(OpenMP REQUIRED)

include(CTest)
option(SIM_ENABLE_SANITIZERS "Enable address and undefined behavior sanitizers" OFF)

add_library(sim_cuda OBJECT src/cuda_probe.cu)
set_target_properties(sim_cuda PROPERTIES CUDA_ARCHITECTURES native)

add_library(blackjack_core STATIC
  src/blackjack.cpp
)
target_include_directories(blackjack_core PUBLIC src)

add_library(strategy_policy STATIC
  src/strategy_package.cpp
)
target_include_directories(strategy_policy PUBLIC src PRIVATE vendor)
target_link_libraries(strategy_policy PUBLIC blackjack_core)

add_executable(simulate-strategy
  src/main.cpp
  src/config.cpp
  src/simulator.cpp
  src/artifacts.cpp
  $<TARGET_OBJECTS:sim_cuda>
)

target_include_directories(simulate-strategy PRIVATE src vendor)
target_link_libraries(simulate-strategy PRIVATE blackjack_core OpenMP::OpenMP_CXX)

add_executable(evaluate-strategy
  src/evaluator_main.cpp
  src/evaluator.cpp
)
target_include_directories(evaluate-strategy PRIVATE src vendor)
target_link_libraries(evaluate-strategy PRIVATE strategy_policy OpenMP::OpenMP_CXX zstd)
target_compile_definitions(evaluate-strategy PRIVATE EVALUATOR_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")

if(BUILD_TESTING)
  add_executable(blackjack-tests tests/blackjack_tests.cpp)
  target_include_directories(blackjack-tests PRIVATE src vendor)
  target_link_libraries(blackjack-tests PRIVATE blackjack_core)
  add_test(NAME blackjack-tests COMMAND blackjack-tests)
  add_executable(config-tests tests/config_tests.cpp src/config.cpp)
  target_include_directories(config-tests PRIVATE src vendor)
  target_link_libraries(config-tests PRIVATE blackjack_core)
  target_compile_definitions(config-tests PRIVATE SIM_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}")
  add_test(NAME config-tests COMMAND config-tests)
  add_executable(strategy-package-tests tests/strategy_package_tests.cpp)
  target_include_directories(strategy-package-tests PRIVATE src vendor)
  target_link_libraries(strategy-package-tests PRIVATE strategy_policy)
  add_test(NAME strategy-package-tests COMMAND strategy-package-tests)
  add_test(NAME evaluator-validate COMMAND evaluate-strategy validate --strategy builtin:basic-6d-h17-das-ls)
  add_test(NAME evaluator-fresh-smoke COMMAND evaluate-strategy run --config ${CMAKE_CURRENT_SOURCE_DIR}/configs/eval-smoke-fresh.json --output /tmp/blackjack-evaluator-ctest)
  set_tests_properties(evaluator-fresh-smoke PROPERTIES WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..)
  add_test(NAME evaluator-continuous-smoke COMMAND evaluate-strategy run --config ${CMAKE_CURRENT_SOURCE_DIR}/configs/eval-smoke-continuous.json --output /tmp/blackjack-evaluator-ctest)
  set_tests_properties(evaluator-continuous-smoke PROPERTIES WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..)
endif()

if(SIM_ENABLE_SANITIZERS)
  foreach(target blackjack_core strategy_policy blackjack-tests config-tests strategy-package-tests simulate-strategy evaluate-strategy)
    target_compile_options(${target} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-fsanitize=address,undefined> $<$<COMPILE_LANGUAGE:CXX>:-fno-omit-frame-pointer>)
    target_link_options(${target} PRIVATE -fsanitize=address,undefined)
  endforeach()
endif()
