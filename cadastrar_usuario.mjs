/**
 * Script para verificar e cadastrar o usuário alangds03@gmail.com no Supabase
 * Execute: node cadastrar_usuario.mjs
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = 'https://xzooieduvylbrpptodth.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fqd3zGYVcqP3XDwClfqF7g_KRCce9Za';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
    console.log('🔍 Buscando usuários cadastrados...\n');

    const { data: analistas, error } = await supabase.from('analistas').select('id, nome, email, acesso, lab_id').order('nome');

    if (error) {
        console.error('❌ Erro ao conectar no Supabase:', error.message);
        return;
    }

    console.log(`✅ Total de usuários encontrados: ${analistas.length}`);
    analistas.forEach(a => {
        console.log(`  - ${a.nome} | ${a.email} | Acesso: ${a.acesso} | Lab: ${a.lab_id || 'global'}`);
    });

    const emailAlvo = 'alangds03@gmail.com';
    const jaExiste = analistas.find(a => a.email === emailAlvo);

    if (jaExiste) {
        console.log(`\n⚠️  O e-mail ${emailAlvo} JÁ ESTÁ CADASTRADO como "${jaExiste.nome}".`);
        console.log('   Se não consegue acessar, o problema é a SENHA. Execute com uma nova senha abaixo.');
        
        // Redefinir senha para "123456" como padrão
        const novaSenhaPlain = '123456';
        const novaSenhaHash = await hashPassword(novaSenhaPlain);
        
        const { error: updateError } = await supabase
            .from('analistas')
            .update({ senha: novaSenhaHash })
            .eq('id', jaExiste.id);

        if (updateError) {
            console.error('❌ Erro ao redefinir senha:', updateError.message);
        } else {
            console.log(`\n✅ Senha redefinida para: "${novaSenhaPlain}"`);
            console.log('   Acesse o sistema com essa senha e altere depois no seu perfil.');
        }
    } else {
        console.log(`\n⚠️  E-mail ${emailAlvo} NÃO encontrado. Cadastrando como admin_global...`);
        
        const senhaPlain = '123456';
        const senhaHash = await hashPassword(senhaPlain);

        const novoUsuario = {
            nome: 'Alan G',
            email: emailAlvo,
            senha: senhaHash,
            cargo: 'Administrador',
            acesso: 'admin_global',
            lab_id: null,
        };

        const { data: criado, error: createError } = await supabase
            .from('analistas')
            .insert([novoUsuario])
            .select()
            .single();

        if (createError) {
            console.error('❌ Erro ao cadastrar usuário:', createError.message);
            console.log('\nVerifique se a tabela "analistas" existe e se as permissões RLS permitem insert.');
        } else {
            console.log('\n✅ Usuário cadastrado com sucesso!');
            console.log(`   E-mail: ${emailAlvo}`);
            console.log(`   Senha:  ${senhaPlain}`);
            console.log(`   Acesso: admin_global`);
            console.log('\n   Use essas credenciais para fazer login no sistema.');
        }
    }
}

main().catch(console.error);
