#include <cstdlib>
#include <string>

namespace blackjack_sim {

int run_sqlite3_script(const std::string& db_path, const std::string& sql_path) {
  const std::string command = "sqlite3 "" + db_path + "" < "" + sql_path + """;
  return std::system(command.c_str());
}

}  // namespace blackjack_sim
