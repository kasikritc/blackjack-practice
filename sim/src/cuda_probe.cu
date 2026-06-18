#include <cuda_runtime.h>

extern "C" int blackjack_sim_cuda_device_count() {
  int count = 0;
  cudaError_t status = cudaGetDeviceCount(&count);
  return status == cudaSuccess ? count : 0;
}

__global__ void accumulate_identity_kernel(const double* input, double* output, int count) {
  int index = blockIdx.x * blockDim.x + threadIdx.x;
  if (index < count) output[index] = input[index];
}
