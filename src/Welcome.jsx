import { ArrowRight, ArrowUpRight, Camera, ClipboardList, ListChecks, ScanLine, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand.jsx';
import { LanguagePicker, useLanguage } from './Language.jsx';
import { workspaceHref } from './entry-route.js';
import pineapplePhoto from '../assets/plates/preview-photo.webp';

export default function Welcome() {
  const { t } = useLanguage();
  const address = window.location.href;
  const guest = workspaceHref(address);
  const signIn = workspaceHref(address, {guest:false});
  const help = workspaceHref(address,{view:'help'});
  return <div className="entry-page">
    <header className="entry-header"><Brand/><div><LanguagePicker/></div></header>
    <main className="entry-main">
      <section className="entry-intro" aria-labelledby="entry-title">
        <div className="entry-copy"><span className="entry-category"><span/>{t('MADE FOR PINEAPPLE CARE')}</span><h1 id="entry-title">{t('A clearer picture.')}<br/><em>{t('A better next step.')}</em></h1><p>{t('Check a pineapple photo, keep your field observations, and plan the care that comes next. All in one simple workspace.')}</p><div className="entry-actions"><a className="button button-primary" href={signIn}>{t('Sign in to scan')}<ArrowRight size={18}/></a><a className="button button-soft" href={guest}>{t('Explore as a guest')}<ArrowUpRight size={17}/></a></div><p className="entry-storage"><ShieldCheck size={16}/>{t('Guest mode saves photos and notes in this browser. Sign in for model analysis.')}</p></div>
        <figure className="entry-photo"><div className="entry-photo-top"><ScanLine size={17}/><span>{t('A CLOSER LOOK STARTS HERE')}</span></div><img src={pineapplePhoto} width="768" height="1024" alt={t('Illustrative pineapple growing in a field')}/><div className="entry-photo-frame" aria-hidden="true"><i/><i/><i/><i/></div><figcaption><span><Camera size={17}/>{t('One clear photo')}</span><small>{t('Illustrative photo · no model result')}</small></figcaption></figure>
      </section>
      <section className="entry-workflow" aria-labelledby="entry-workflow-title"><header><h2 id="entry-workflow-title">{t('Less searching. More growing.')}</h2></header><div className="entry-steps">{[
        [ScanLine,'01','Check the photo','Choose one clear photo and review what the model finds.'],
        [ClipboardList,'02','Keep the record','Save photos and your own observations with the right growing area.'],
        [ListChecks,'03','Plan the next visit','Choose a care action, give it a date, and follow it through.']
      ].map(([Icon,number,title,description])=><article key={number}><div><Icon size={23} strokeWidth={1.5}/><span>{number}</span></div><h3>{t(title)}</h3><p>{t(description)}</p></article>)}</div></section>
    </main>
    <footer className="entry-footer"><span>AgriVision<span>{t('Pineapple care, one visit at a time.')}</span></span><a href={help}>{t('Help center')}<ArrowUpRight size={14}/></a></footer>
  </div>;
}
