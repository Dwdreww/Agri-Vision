import { t } from './i18n.js';
import { ArrowRight, BookOpen, Leaf, Microscope, Sprout } from 'lucide-react';
import { ConditionBadge } from './components';
import { activeConditionLabels, conditionTypes, supportedConditions } from './conditions';

const guideConditions = supportedConditions.filter(({ label }) => activeConditionLabels.includes(label));
const groups = [
  { type: 'pathological', title: 'Pathological diseases', Icon: Microscope, hint: 'Infectious conditions' },
  { type: 'physiological', title: 'Physiological disorders', Icon: Sprout, hint: 'Growth & development' },
  { type: 'healthy', title: 'No disease detected', Icon: Leaf, hint: 'Routine monitoring' }
];

export default function HealthGuideView({ onNavigate }) {
  return <div className="view health-guide-view">
    <div className="page-intro"><div><span className="eyebrow">{t("PINEAPPLE HEALTH")}</span><h1>{t("Get to know your crop.")}</h1><p>{t("The current model recognizes No Disease, Fruit Fasciation, Fruit Rot, and Multiple Crown.")}</p></div><button className="button button-primary" type="button" onClick={() => onNavigate('scan')}>{t("Check a sample ")}<ArrowRight size={17} /></button></div>
    <div className="guide-intro"><BookOpen size={23} /><p>{t("Condition type explains the kind of result. The health status and model confidence describe different aspects of the check.")}</p></div>
    <div className="condition-guide-grid">{groups.map(({ type, title, Icon, hint }) => <section className={`panel condition-group group-${type}`} key={type}>
      <div className="condition-group-heading"><span className={`guide-icon type-${type}`}><Icon size={24} /></span><span className="eyebrow">{t(hint)}</span><h2>{t(title)}</h2><p>{t(conditionTypes[type].description)}</p></div>
      <ul className="condition-reference">
        {guideConditions.filter(condition => condition.type === type).map(condition => <li key={condition.label}>
          <h3>{t(condition.label)}</h3>
          <p>{t(condition.description)}</p>
          <ConditionBadge label={condition.label} />
        </li>)}
      </ul>
    </section>)}</div>
    <p className="guide-note">{t("A photo prediction suggests a condition; it does not confirm the cause or severity. “No Detection” and unfamiliar labels remain unclassified. Other pineapple conditions are outside the current model’s supported classes.")}</p>
    <details className="panel guide-sources"><summary>{t("About these classifications & sources")}</summary><p>{t("Fruit rot is grouped as a disease. Fruit fasciation and multiple crowns are grouped as growth disorders. Use the photo result to guide a check in the field.")}</p><ul>
      <li><a href="https://nhb.gov.in/pdf/fruits/pineapple/pin003.pdf" target="_blank" rel="noreferrer">{t("National Horticulture Board · Pineapple disorders")}</a></li>
      <li><a href="https://www.itfnet.org/v1/2016/05/pineapple-agronomy/" target="_blank" rel="noreferrer">{t("International Tropical Fruits Network · Pineapple agronomy")}</a></li>
      <li><a href="https://agritech.tnau.ac.in/crop_protection/pineapple_diseases_2.html" target="_blank" rel="noreferrer">{t("Tamil Nadu Agricultural University · Pineapple fruit rot")}</a></li>
    </ul></details>
  </div>;
}
