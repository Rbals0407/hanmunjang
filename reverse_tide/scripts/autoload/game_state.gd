extends Node
## 게임 전체 상태를 기억하는 전역 스크립트 (어느 장면에서든 GameState로 접근)

const EVIDENCE_TOTAL := 3

var chapter: int = 0            # 0=Prologue, 1=Ch.1, 2=Ch.2, 3=Ch.3
var evidence: Dictionary = {}   # 증거 id -> true (중복 수집 방지용)
var wrote_record: bool = false  # 동굴에서 수첩에 기록을 남겼는가
var flags: Dictionary = {}      # 1회용 이벤트 잠금 플래그
var ui_lock_count: int = 0      # 대사창/선택지가 열려 있으면 1 이상


func evidence_count() -> int:
	return evidence.size()


## 증거 획득. 이미 가진 증거면 false를 돌려주고 아무것도 안 함.
func add_evidence(id: String) -> bool:
	if evidence.has(id):
		return false
	evidence[id] = true
	return true


func has_flag(id: String) -> bool:
	return flags.get(id, false)


func set_flag(id: String) -> void:
	flags[id] = true


## UI가 열려 있는 동안 플레이어 이동과 타이머를 멈추기 위한 확인용
func is_ui_open() -> bool:
	return ui_lock_count > 0


func reset() -> void:
	chapter = 0
	evidence.clear()
	wrote_record = false
	flags.clear()
	ui_lock_count = 0
