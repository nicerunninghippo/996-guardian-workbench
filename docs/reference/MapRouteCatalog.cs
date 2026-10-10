using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

public sealed class RouteMapDefinition {
 public string Id {get;set;}
 public string Name {get;set;}
 public int MinLevel {get;set;}
 public int Priority {get;set;}
 public bool Enabled {get;set;}
}

public static class RouteMapCatalog {
 public static RouteMapDefinition[] Defaults(){return new[]{
  new RouteMapDefinition{Id="panjun-base",Name="叛军基地",MinLevel=79,Priority=1,Enabled=true},
  new RouteMapDefinition{Id="shiyuan-forest",Name="石原森林",MinLevel=78,Priority=2,Enabled=true},
  new RouteMapDefinition{Id="panjun-camp",Name="叛军营地",MinLevel=0,Priority=3,Enabled=true},
  new RouteMapDefinition{Id="battle-outpost",Name="战场前哨",MinLevel=0,Priority=4,Enabled=true},
  new RouteMapDefinition{Id="dragon-claw",Name="龙爪要塞",MinLevel=0,Priority=5,Enabled=true}};}
 public static bool IsNewMap(RouteMapDefinition map){return map.Id=="shiyuan-forest"||map.Id=="panjun-base";}
 public static RouteMapDefinition[] Load(string root,out string warning){
  warning="";string path=Path.Combine(root,"map-routes.json");
  if(!File.Exists(path)){warning="未找到 map-routes.json，使用默认五图优先级和等级门槛";return Defaults();}
  try {
   RouteMapDefinition[] maps=new JavaScriptSerializer().Deserialize<RouteMapDefinition[]>(File.ReadAllText(path,Encoding.UTF8));
   Validate(maps);Array.Sort(maps,delegate(RouteMapDefinition a,RouteMapDefinition b){return a.Priority.CompareTo(b.Priority);});return maps;
  } catch(Exception ex){warning="map-routes.json 无效，已回退默认五图配置："+ex.Message;return Defaults();}
 }
 static void Validate(RouteMapDefinition[] maps){
  if(maps==null||maps.Length!=5)throw new FormatException("必须完整配置五张地图");
  Dictionary<string,int> minimum=new Dictionary<string,int>(StringComparer.Ordinal);
  foreach(RouteMapDefinition map in Defaults())minimum.Add(map.Id,map.MinLevel);
  HashSet<string> ids=new HashSet<string>(StringComparer.OrdinalIgnoreCase),names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  HashSet<int> priorities=new HashSet<int>();bool enabled=false;
  foreach(RouteMapDefinition map in maps){
   if(map==null||string.IsNullOrWhiteSpace(map.Id)||string.IsNullOrWhiteSpace(map.Name))throw new FormatException("地图 ID 和名称不能为空");
   map.Id=map.Id.Trim();map.Name=map.Name.Trim();
   if(!ids.Add(map.Id)||!names.Add(map.Name))throw new FormatException("地图 ID 或名称重复");
   if(!minimum.ContainsKey(map.Id))throw new FormatException("未知地图 ID："+map.Id);
   foreach(RouteMapDefinition known in Defaults())if(known.Id==map.Id&&known.Name!=map.Name)throw new FormatException("地图名称必须与ID对应："+known.Name);
   if(map.Priority<=0||!priorities.Add(map.Priority))throw new FormatException("Priority 必须为不重复的正整数");
   if(map.MinLevel<minimum[map.Id]||map.MinLevel>999)throw new FormatException(map.Name+" 的 MinLevel 必须介于 "+minimum[map.Id]+" 与 999；不可降低固有等级门槛");
   enabled|=map.Enabled;
  }
  if(!enabled)throw new FormatException("至少启用一张地图");
 }
}

// Per-instance policy state. A generic reset preserves cooldowns and the new-map
// entry budget. Only a confirmed town cycle may clear EntryIssued.
public sealed class MapPriorityState {
 public readonly RouteMapDefinition[] Maps;
 public readonly string[] Names;
 public readonly bool[] Failed,EntryIssued,ConfirmedUnavailable;
 public readonly DateTime[] CooldownUntil;
 public int CurrentLevel=-1,Selected=-1,Active=-1,PortalAttempts,EnterAttempts;
 public DateTime LastAction=DateTime.MinValue,RetryAfter=DateTime.MinValue;
 public const int SearchLimitSeconds=60,SearchCooldownSeconds=300;
 public int SearchIndex=-1;
 public DateTime SearchSince=DateTime.MinValue,HallSince=DateTime.MinValue;
 public DateTime ActiveSince=DateTime.MinValue;
 bool visitedHall;int observed=-9,observations;
 public MapPriorityState():this(RouteMapCatalog.Defaults()){}
 public MapPriorityState(RouteMapDefinition[] maps){
  Maps=(RouteMapDefinition[])(maps??RouteMapCatalog.Defaults()).Clone();Array.Sort(Maps,delegate(RouteMapDefinition a,RouteMapDefinition b){return a.Priority.CompareTo(b.Priority);});
  Names=new string[Maps.Length];for(int i=0;i<Maps.Length;i++)Names[i]=Maps[i].Name;
  Failed=new bool[Maps.Length];EntryIssued=new bool[Maps.Length];ConfirmedUnavailable=new bool[Maps.Length];CooldownUntil=new DateTime[Maps.Length];
 }
 public string NameList {get{return string.Join(" > ",Names);}}
 public string EligibleNameList {get{var names=new List<string>();for(int i=0;i<Maps.Length;i++)if(LevelEligible(i))names.Add(Names[i]);return names.Count==0?"暂无等级满足的目标":string.Join(" > ",names.ToArray());}}
 public void Reset(){Reset(false);}
 public void Reset(bool newTownCycle){
  if(newTownCycle){Array.Clear(Failed,0,Failed.Length);Array.Clear(ConfirmedUnavailable,0,ConfirmedUnavailable.Length);Array.Clear(EntryIssued,0,EntryIssued.Length);SearchIndex=-1;SearchSince=HallSince=DateTime.MinValue;}
  Selected=Active=-1;PortalAttempts=EnterAttempts=0;LastAction=RetryAfter=ActiveSince=DateTime.MinValue;visitedHall=false;observed=-9;observations=0;
 }
 bool LevelEligible(int i){return Maps[i].Enabled&&(Maps[i].MinLevel==0||CurrentLevel>=Maps[i].MinLevel);}
 bool BudgetAvailable(int i){return !RouteMapCatalog.IsNewMap(Maps[i])||!EntryIssued[i];}
 public int SearchTarget(DateTime now){
  if(Active>=0)return Active;
  for(int i=0;i<Maps.Length;i++)if(LevelEligible(i)&&!Failed[i]&&BudgetAvailable(i)&&now>=CooldownUntil[i])return i;
  return -1;
 }
 // This deadline belongs to the hall visit, not RouteEngine's 90-second round.
 // A missing portal must consume a budget even when no click was ever issued.
 public string AdvanceSearch(DateTime now){
  if(HallSince==DateTime.MinValue)HallSince=now;
  if(Active>=0){if(Failed[Active]||(now-ActiveSince).TotalSeconds>=(EntryIssued[Active]?25:12))return Fail("入口操作总等待超时，停止原目标占用",now);return "";}
  int candidate=SearchTarget(now);
  if(candidate<0){SearchIndex=-1;SearchSince=DateTime.MinValue;UpdateRetryAfter(now);return "";}
  if(candidate!=SearchIndex||SearchSince==DateTime.MinValue){SearchIndex=candidate;SearchSince=now;return "下图限时寻找："+Names[candidate]+"；最多"+SearchLimitSeconds+"秒，未确认入口就按优先级换图";}
  if((now-SearchSince).TotalSeconds<SearchLimitSeconds)return "";
  Failed[candidate]=true;CooldownUntil[candidate]=now.AddSeconds(SearchCooldownSeconds);
  SearchIndex=SearchTarget(now);SearchSince=SearchIndex<0?DateTime.MinValue:now;UpdateRetryAfter(now);
  return "下图兜底："+Names[candidate]+"连续"+SearchLimitSeconds+"秒未确认可靠入口；冷却"+SearchCooldownSeconds+"秒；"+(SearchIndex<0?"全部候选暂不可用，等待冷却并允许有界BOSS备用入口": "转向"+Names[SearchIndex])+"；不是条件不足，不猜坐标、不重复消耗";
 }
 public bool CanUseBossFallback(DateTime now){return HallSince!=DateTime.MinValue&&(now-HallSince).TotalSeconds>=300&&Active<0;}
 public int RequiredFirstMap(DateTime now){
  if(CurrentLevel<79)return -1;
  for(int i=0;i<Maps.Length;i++)if(Maps[i].Id=="panjun-base"&&LevelEligible(i)&&!Failed[i]&&now>=CooldownUntil[i]&&!ConfirmedUnavailable[i]&&BudgetAvailable(i))return i;
  return -1;
 }
 public int Choose(double[] scores){return Choose(scores,DateTime.Now);}
 public int Choose(double[] scores,DateTime now){
  Selected=-1;if(scores==null)return -1;
  if(Active>=0){if(Active<scores.Length&&LevelEligible(Active)&&!Failed[Active]&&BudgetAvailable(Active)&&now>=CooldownUntil[Active]&&scores[Active]>=.53)Selected=Active;return Selected;}
  int required=RequiredFirstMap(now);
  if(required>=0){if(!Failed[required]&&now>=CooldownUntil[required]&&required<scores.Length&&scores[required]>=.53)Selected=required;return Selected;}
  for(int i=0;i<Maps.Length&&i<scores.Length;i++)if(LevelEligible(i)&&!Failed[i]&&BudgetAvailable(i)&&now>=CooldownUntil[i]&&scores[i]>=.53){Selected=i;break;}
  return Selected;
 }
 public void PortalClicked(DateTime now){
  if(Selected<0||Selected>=Maps.Length||!LevelEligible(Selected)||Failed[Selected]||!BudgetAvailable(Selected)||now<CooldownUntil[Selected])return;
  if(Active!=Selected){Active=Selected;ActiveSince=now;PortalAttempts=EnterAttempts=0;}PortalAttempts++;LastAction=now;visitedHall=true;
 }
 public void EnterClicked(DateTime now){
  if(Active<0||Active>=Maps.Length||Failed[Active]||!BudgetAvailable(Active))return;
  EnterAttempts++;PortalAttempts=0;EntryIssued[Active]=true;LastAction=ActiveSince=now;
 }
 public string Fail(string reason){return Fail(reason,DateTime.Now);}
 public string Fail(string reason,DateTime now,bool confirmedUnavailable=false){
  if(Active<0)return "";int index=Active;int seconds=SearchCooldownSeconds;
  ConfirmedUnavailable[index]=confirmedUnavailable;
  Failed[index]=true;DateTime until=now.AddSeconds(seconds);if(until>CooldownUntil[index])CooldownUntil[index]=until;
  Active=Selected=-1;PortalAttempts=EnterAttempts=0;LastAction=ActiveSince=DateTime.MinValue;SearchIndex=-1;SearchSince=DateTime.MinValue;UpdateRetryAfter(now);
  return Names[index]+"本轮未能进入（"+reason+"）；冷却"+seconds+"秒，按优先顺序寻找其他图；进入预算保持不变";
 }
 void UpdateRetryAfter(DateTime now){
  RetryAfter=DateTime.MinValue;DateTime earliest=DateTime.MaxValue;
  for(int i=0;i<Maps.Length;i++)if(LevelEligible(i)&&BudgetAvailable(i)){
   if(!Failed[i]&&now>=CooldownUntil[i])return;
   if(CooldownUntil[i]>now&&CooldownUntil[i]<earliest)earliest=CooldownUntil[i];
  }
  if(earliest!=DateTime.MaxValue)RetryAfter=earliest;
 }
 public string Observe(int map,DateTime now){
  if(map==observed)observations++;else{observed=map;observations=1;}
  if(observations<3)return "";
  if(map==3){
   if(HallSince==DateTime.MinValue)HallSince=now;
   if(Active>=0&&(Failed[Active]||(now-ActiveSince).TotalSeconds>=(EntryIssued[Active]?25:12)))return Fail("神龙入口操作未确认，释放目标占用并尝试其他图",now);
   visitedHall=true;bool recovered=false;
   for(int i=0;i<Maps.Length;i++)if(Failed[i]&&BudgetAvailable(i)&&now>=CooldownUntil[i]){Failed[i]=false;recovered=true;}
   UpdateRetryAfter(now);
   if(recovered)return "目标冷却结束：按配置优先级继续；新图本周期进入预算保持不变";
  }
  if(map==4){visitedHall=true;Active=Selected=-1;PortalAttempts=EnterAttempts=0;SearchIndex=-1;SearchSince=HallSince=DateTime.MinValue;return "";}
  if(map>=0&&map<3&&visitedHall){Reset(true);return "新回城周期：恢复地图候选，保留尚未结束的冷却；"+NameList;}
  if(map==3&&Active>=0&&(now-LastAction).TotalSeconds>=3.5&&(PortalAttempts>=2||EnterAttempts>=2))return Fail("多次尝试后仍在神龙帝国",now);
  return "";
 }
}
